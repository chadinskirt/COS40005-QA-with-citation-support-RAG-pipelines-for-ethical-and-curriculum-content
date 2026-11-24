cmake_minimum_required(VERSION 3.18)

project(RAG LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

FetchContent_Declare(
    json
    URL https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz
)

FetchContent_MakeAvailable(json)

add_subdirectory(external/tokenizers-cpp)
add_subdirectory(tokenizer)

add_executable(RAG
    main.cpp
)

target_link_libraries(RAG PRIVATE
    tokenizer
)

target_include_directories(tokenizer
    PUBLIC
        ${PROJECT_SOURCE_DIR}/external/tokenizers-cpp/include
)
target_include_directories(tokenizer
    PUBLIC
        ${PROJECT_SOURCE_DIR}/external/tokenizers-cpp/src
)