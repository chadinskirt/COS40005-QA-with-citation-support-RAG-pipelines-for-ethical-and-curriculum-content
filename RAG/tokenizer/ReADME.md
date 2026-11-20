sudo apt install -y \ 
    build-essential \
    cmake \
    git \
    pkg-config \
    curl

git submodule add \
    https://github.com/mlc-ai/tokenizers-cpp.git \
    external/tokenizers-cpp