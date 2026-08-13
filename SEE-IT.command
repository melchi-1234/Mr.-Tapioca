#!/bin/bash
# Double-click this file to look at everything built overnight.
# It starts a little local web server and opens the pages in your browser.
# Close the black Terminal window when you are done. Nothing is published.
cd "$(dirname "$0")"
PORT=8899
echo ""
echo "  Starting Mr. Tapioca on http://127.0.0.1:$PORT"
echo "  Leave this window open. Close it when you are finished."
echo ""
python3 -m http.server $PORT >/dev/null 2>&1 &
SERVER=$!
sleep 1
open "http://127.0.0.1:$PORT/"                                   # the app
open "http://127.0.0.1:$PORT/verify/index.html?demo=1"           # the cashier page
open "http://127.0.0.1:$PORT/docs/network-v1/site/index.html"    # new website idea
open "http://127.0.0.1:$PORT/docs/network-v1/sample-pilot-report.html"  # shop report
trap "kill $SERVER 2>/dev/null" EXIT
wait $SERVER
