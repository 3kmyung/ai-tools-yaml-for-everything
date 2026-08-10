const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ? message + ": " : ""}expected ${e}, got ${a}`);
}

export function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message ? message + ": " : ""}expected ~${expected}, got ${actual}`);
  }
}

export async function run() {
  const list = document.getElementById("results");
  let failed = 0;

  for (const { name, fn } of tests) {
    const item = document.createElement("li");
    try {
      await fn();
      item.className = "pass";
      item.textContent = `PASS  ${name}`;
    } catch (error) {
      failed += 1;
      item.className = "fail";
      item.textContent = `FAIL  ${name} — ${error.message}`;
    }
    list.appendChild(item);
  }

  const summary = document.createElement("li");
  summary.className = failed ? "fail" : "pass";
  summary.textContent = `${tests.length - failed}/${tests.length} passed`;
  list.appendChild(summary);

  document.title = failed ? `FAIL (${failed})` : "PASS";
  window.__testResult = { total: tests.length, failed };
}
