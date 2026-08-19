// Schedules a lightweight, backend-only request to this process's health endpoint.
import { env } from "../config/env.js";

const DEFAULT_TIMEOUT_MS = 10_000;

function describeError(error) {
  if (error?.name === "AbortError") return "request timed out";
  return error?.message || String(error);
}

export function createKeepAliveService(config, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const scheduleTimeout = dependencies.scheduleTimeout || globalThis.setTimeout;
  const cancelScheduledTimeout = dependencies.cancelScheduledTimeout || globalThis.clearTimeout;
  const scheduleAbort = dependencies.scheduleAbort || globalThis.setTimeout;
  const cancelAbort = dependencies.cancelAbort || globalThis.clearTimeout;
  const random = dependencies.random || Math.random;
  const logger = dependencies.logger || console;

  let timer = null;
  let activeController = null;
  let started = false;

  const targetMs = config.intervalSeconds * 1000;
  const jitterMs = config.jitterSeconds * 1000;

  function nextDelayMs() {
    return Math.round(targetMs - jitterMs + random() * jitterMs * 2);
  }

  function requestUrl() {
    return new URL(config.path, `${config.baseUrl.replace(/\/+$/, "")}/`).toString();
  }

  function scheduleNext() {
    if (!started) return;
    timer = scheduleTimeout(runAttempt, nextDelayMs());
    timer?.unref?.();
  }

  async function runAttempt() {
    if (!started) return;

    timer = null;
    const controller = new AbortController();
    activeController = controller;
    const abortTimer = scheduleAbort(() => controller.abort(), config.timeoutMs || DEFAULT_TIMEOUT_MS);
    abortTimer?.unref?.();

    try {
      const response = await fetchImpl(requestUrl(), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (config.logging) logger.info("[KeepAlive] health check successful");
    } catch (error) {
      logger.warn(`[KeepAlive] health check failed: ${describeError(error)}`);
    } finally {
      cancelAbort(abortTimer);
      activeController = null;
      scheduleNext();
    }
  }

  function start() {
    if (started || !config.enabled) return false;
    if (!config.baseUrl) {
      logger.warn("[KeepAlive] disabled: no backend base URL configured");
      return false;
    }
    started = true;
    scheduleNext();
    return true;
  }

  function stop() {
    if (!started) return false;
    started = false;
    if (timer) cancelScheduledTimeout(timer);
    timer = null;
    activeController?.abort();
    activeController = null;
    return true;
  }

  return { start, stop, nextDelayMs, isStarted: () => started };
}

let keepAliveInstance;

export function startKeepAlive() {
  if (!keepAliveInstance) keepAliveInstance = createKeepAliveService(env.keepAlive);
  keepAliveInstance.start();
  return keepAliveInstance;
}

export function stopKeepAlive() {
  const stopped = keepAliveInstance?.stop() || false;
  keepAliveInstance = undefined;
  return stopped;
}
