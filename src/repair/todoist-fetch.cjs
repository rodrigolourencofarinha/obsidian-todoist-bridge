const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_TODOIST_TASKS_URL = "https://api.todoist.com/api/v1/tasks";

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

async function fetchTodoistTask(token, taskId, options = {}, attempt = 1) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = normalizePositiveNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxNetworkAttempts = normalizePositiveNumber(options.maxNetworkAttempts, 3);
  const maxServerAttempts = normalizePositiveNumber(options.maxServerAttempts, 5);
  const baseUrl = String(options.baseUrl || DEFAULT_TODOIST_TASKS_URL).replace(/\/+$/, "");
  const url = `${baseUrl}/${encodeURIComponent(taskId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === "function") timer.unref();

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      return { __error: `timeout after ${timeoutMs}ms` };
    }
    if (attempt < maxNetworkAttempts) {
      await sleep(500 * attempt);
      return fetchTodoistTask(token, taskId, options, attempt + 1);
    }
    return { __error: error.message };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) return { __missing: true };
  if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < maxServerAttempts) {
    await sleep(750 * attempt);
    return fetchTodoistTask(token, taskId, options, attempt + 1);
  }
  if (response.status === 429 && attempt < maxServerAttempts) {
    const retryAfter = Number(response.headers.get("retry-after") || "1");
    await sleep(Math.max(1, retryAfter) * 1000);
    return fetchTodoistTask(token, taskId, options, attempt + 1);
  }

  const text = await response.text();
  if (response.status < 200 || response.status >= 300) {
    return { __error: `${response.status}${text ? ` ${text.slice(0, 160)}` : ""}` };
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return { __error: `parse error: ${error.message}` };
  }
}

module.exports = {
  fetchTodoistTask
};
