// Catches broken page renders and shows a retry path.
import { Component } from "react";
import RuntimeErrorFallback from "./RuntimeErrorFallback.jsx";
import { reportFrontendError } from "../../../utils/errorReporting.js";

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportFrontendError(error, { componentStack: info?.componentStack, boundary: "global" });
  }

  retry = () => {
    if (import.meta.env.DEV) {
      const testId = new URLSearchParams(window.location.search).get("__test_render_error");
      if (testId) sessionStorage.setItem(`render_error_recovered:${testId}`, "1");
    }
    this.setState({ hasError: false });
  };

  goHome = () => {
    window.history.replaceState({}, "", "/");
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <RuntimeErrorFallback onRetry={this.retry} onGoHome={this.goHome} />;
    }
    return this.props.children;
  }
}




