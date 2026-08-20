---
description: Stop the local Slides Lab dev server (defaults to :3000, accepts a port arg).
argument-hint: [port]
allowed-tools: Bash(lsof *), Bash(kill *), Bash(echo *), Bash(netstat *), Bash(taskkill *), Bash(uname *)
---

Port to stop: $ARGUMENTS (defaults to 3000 if empty).

Platform: !`uname -s 2>/dev/null || echo Windows`

If the platform is Windows (or `uname` reported MINGW/CYGWIN/MSYS), run:

```bash
PORT=${ARGUMENTS:-3000}
PIDS=$(netstat -ano -p tcp | grep -E ":$PORT\s+.*LISTENING" | awk '{print $NF}' | sort -u)
if [ -n "$PIDS" ]; then
  for PID in $PIDS; do taskkill //PID $PID //T //F; done
  echo "Stopped server on :$PORT (PIDs: $PIDS)."
else
  echo "Nothing was running on :$PORT."
fi
```

Otherwise (macOS / Linux), run:

```bash
PORT=${ARGUMENTS:-3000}
PIDS=$(lsof -ti :$PORT 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill 2>/dev/null && echo "Stopped server on :$PORT (PIDs: $PIDS)."
else
  echo "Nothing was running on :$PORT."
fi
```

Report the result in one line.
