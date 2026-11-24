add_library(tokenizer STATIC
    src/tokenizer.cpp
    src/loader.cpp
)

target_include_directories(tokenizer
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(tokenizer
    PRIVATE
        nlohmann_json::nlohmann_json
        tokenizers_cpp
)

