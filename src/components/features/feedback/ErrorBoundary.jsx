// Catches broken page renders and shows a retry path.
import { Component, Fragment } from "react";
import RuntimeErrorFallback from "./RuntimeErrorFallback.jsx";
import RecoveryOverlay from "./RecoveryOverlay.jsx";
import { reportFrontendError, reportFrontendRecovery } from "../../../utils/errorReporting.js";
import { lockBodyScroll, unlockBodyScroll } from "../../../hooks/useBodyScrollLock.js";

const MAX_RECOVERY_ATTEMPTS = 3;
const RECOVERY_DELAYS = [150, 400, 900];

export default class ErrorBoundary extends Component {
  state = { hasError: false, recovering: false, attempts: 0, recoveryKey: 0 };
  recoveryTimer = null;
  scrollLocked = false;

  static getDerivedStateFromError() {
    return { hasError: true, recovering: true };
  }

  componentDidCatch(error, info) {
    const nextAttempt = this.state.attempts + 1;
    reportFrontendError(error, {
      componentStack: info?.componentStack,
      boundary: "global",
      retryCount: Math.min(nextAttempt, MAX_RECOVERY_ATTEMPTS),
      recoveryResult: nextAttempt > MAX_RECOVERY_ATTEMPTS ? "exhausted" : "scheduled",
    });
    if (nextAttempt > MAX_RECOVERY_ATTEMPTS) {
      this.setState({ recovering: false });
      return;
    }
    this.scheduleRecovery(nextAttempt);
  }

  componentDidMount() {
    this.syncScrollLock();
  }

  componentDidUpdate(previousProps, previousState) {
    this.syncScrollLock();
    if (previousState.hasError && !this.state.hasError) {
      reportFrontendRecovery({
        retryCount: this.state.attempts,
      });
    }
  }

  componentWillUnmount() {
    window.clearTimeout(this.recoveryTimer);
    if (this.scrollLocked) unlockBodyScroll();
  }

  syncScrollLock = () => {
    if (this.state.recovering && !this.scrollLocked) {
      lockBodyScroll();
      this.scrollLocked = true;
    } else if (!this.state.recovering && this.scrollLocked) {
      unlockBodyScroll();
      this.scrollLocked = false;
    }
  };

  scheduleRecovery = (attempt) => {
    window.clearTimeout(this.recoveryTimer);
    this.recoveryTimer = window.setTimeout(() => {
      this.setState((current) => ({
        hasError: false,
        recovering: false,
        attempts: attempt,
        recoveryKey: current.recoveryKey + 1,
      }));
    }, RECOVERY_DELAYS[attempt - 1]);
  }

  retry = () => {
    if (import.meta.env.DEV) {
      const testId = new URLSearchParams(window.location.search).get("__test_render_error");
      if (testId) sessionStorage.setItem(`render_error_recovered:${testId}`, "1");
    }
    this.setState({ hasError: true, recovering: true, attempts: 0 }, () => this.scheduleRecovery(1));
  };

  goHome = () => {
    window.history.replaceState({}, "", "/");
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.state.recovering) return <RecoveryOverlay attempt={Math.min(this.state.attempts + 1, MAX_RECOVERY_ATTEMPTS)} maximum={MAX_RECOVERY_ATTEMPTS} />;
      return <RuntimeErrorFallback onRetry={this.retry} onGoHome={this.goHome} />;
    }
    return <Fragment key={this.state.recoveryKey}>{this.props.children}</Fragment>;
  }
}




