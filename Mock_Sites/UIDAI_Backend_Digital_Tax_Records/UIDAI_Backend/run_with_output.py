"""
Wrapper: runs another Python script and writes its output to result.txt.
Usage: C:\Python314\python.exe run_with_output.py <script.py> <result_file.txt>
"""
import sys, os, subprocess

script = sys.argv[1]
result_file = sys.argv[2] if len(sys.argv) > 2 else "result.txt"

# Build env with venv site-packages
env = os.environ.copy()
venv_sp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "venv", "Lib", "site-packages")
existing = env.get("PYTHONPATH", "")
env["PYTHONPATH"] = venv_sp + (os.pathsep + existing if existing else "")

proc = subprocess.run(
    [sys.executable, script],
    capture_output=True,
    text=True,
    env=env,
    cwd=os.path.dirname(os.path.abspath(__file__))
)

output = proc.stdout + ("\n--- STDERR ---\n" + proc.stderr if proc.stderr else "")
output += f"\n--- EXIT: {proc.returncode} ---"

with open(result_file, "w", encoding="utf-8") as f:
    f.write(output)

# Also print to stdout
print(output)
