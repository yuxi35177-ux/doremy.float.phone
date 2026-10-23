#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <vector>
#include <thread>
#include <android/log.h>
#include <string>
#include "node.h"
extern "C" JNIEXPORT jint JNICALL
Java_app_floatphone_shell_LocalRuntime_startNode(JNIEnv* env, jobject, jstring dir, jint port, jstring key) {
    const char* root = env->GetStringUTFChars(dir, nullptr);
    const char* secret = env->GetStringUTFChars(key, nullptr);
    int logs[2];
    if (pipe(logs) == 0) {
        dup2(logs[1], STDOUT_FILENO);
        dup2(logs[1], STDERR_FILENO);
        close(logs[1]);
        std::thread([fd = logs[0]] {
            char line[2048]; ssize_t count;
            while ((count = read(fd, line, sizeof(line) - 1)) > 0) {
                line[count] = 0;
                __android_log_write(ANDROID_LOG_INFO, "PhoneNode", line);
            }
            close(fd);
        }).detach();
    }
    chdir(root);
    setenv("HOSTNAME", "127.0.0.1", 1);
    setenv("PORT", std::to_string(port).c_str(), 1);
    setenv("PHONE_LOCAL_TOKEN", secret, 1);
    setenv("NODE_ENV", "production", 1);
    env->ReleaseStringUTFChars(dir, root);
    env->ReleaseStringUTFChars(key, secret);
    // libuv expects the argument strings to occupy contiguous memory.
    char args[] = "node\0phone-bootstrap.cjs\0";
    char* argv[] = { args, args + 5 };
    return node::Start(2, argv);
}
