#/bin/bash

# build
mkdir -p build
cd build
cmake ..
make -n$(nproc)
cd ..
# get example files

mkdir -p dist/bge-small
cd dist/bge-small || exit 1

BASE_URL="https://huggingface.co/BAAI/bge-small-en-v1.5/tree/main"

if [ ! -f "tokenizer.json" ]; then
    wget -O tokenizer.json "$BASE_URL/tokenizer.json"
fi

if [ ! -f "vocab.txt" ]; then
    wget -O vocab.txt "$BASE_URL/vocab.txt"
fi

if [ ! -f "tokenizer_config.json" ]; then
    wget -O tokenizer_config.json "$BASE_URL/tokenizer_config.json"
fi

if [ ! -f "config.json" ]; then
    wget -O config.json "$BASE_URL/config.json"
fi

if [ ! -f "model.safetensors" ]; then
    wget -O model.safetensors "$BASE_URL/model.safetensors"
fi

echo "BGE-small downloaded successfully."

# run
echo "---Running----"
./build/example
