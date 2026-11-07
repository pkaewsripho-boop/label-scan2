#!/bin/sh
cd "$(dirname "$0")" || exit 1
PORT=3003 node server.cjs
