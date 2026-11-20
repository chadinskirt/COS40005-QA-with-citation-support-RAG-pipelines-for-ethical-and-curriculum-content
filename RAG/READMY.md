## for adding tokenizer environment into current direction
git submodule add https://github.com/mlc-ai/tokenizers-cpp.git external/tokenizers-cpp

## for building execution environment for tokenizer
cd RAG/
cmake -S . -B build
cmake --build build -j$(nproc)