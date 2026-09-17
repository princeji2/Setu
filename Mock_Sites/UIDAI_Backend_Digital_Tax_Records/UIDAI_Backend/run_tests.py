"""
Run the pytest suite using system Python + venv site-packages.
Writes result to test_results.txt.
"""
import sys, os, subprocess

base = os.path.dirname(os.path.abspath(__file__))
venv_py = os.path.join(base, "venv", "Scripts", "python.exe")
py_bin = venv_py if os.path.exists(venv_py) else sys.executable
venv_sp = os.path.join(base, "venv", "Lib", "site-packages")

env = os.environ.copy()
existing = env.get("PYTHONPATH", "")
env["PYTHONPATH"] = venv_sp + (os.pathsep + existing if existing else "")

proc = subprocess.run(
    [py_bin, "-m", "pytest", "tests/test_api.py", "-v", "--tb=short", "--no-header"],
    capture_output=True,
    text=True,
    env=env,
    cwd=base
)

output = proc.stdout + ("\n--- STDERR ---\n" + proc.stderr if proc.stderr.strip() else "")
output += f"\n--- EXIT CODE: {proc.returncode} ---"

result_file = os.path.join(base, "test_results.txt")
with open(result_file, "w", encoding="utf-8") as f:
    f.write(output)

print(f"Tests complete. Exit code: {proc.returncode}")
print(f"Results written to: {result_file}")
# Print last 200 lines
lines = output.split("\n")
print("\n".join(lines[-200:]))
