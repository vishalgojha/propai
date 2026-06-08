#!/bin/sh
set -e

# Start Ollama in background
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "Waiting for Ollama to start..."
for i in $(seq 1 30); do
  if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "Ollama is ready"
    break
  fi
  sleep 1
done

# Pull embeddings model
echo "Pulling nomic-embed-text..."
ollama pull nomic-embed-text
echo "Model ready"

# Bring Ollama to foreground
wait $OLLAMA_PID
