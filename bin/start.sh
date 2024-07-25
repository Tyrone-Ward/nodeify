#!/bin/bash

# Path to the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

nodemon "$PROJECT_ROOT/server.js"
