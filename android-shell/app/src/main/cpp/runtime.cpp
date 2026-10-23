#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <vector>
#include <string>
#include "node.h"
extern "C" JNIEXPORT jint JNICALL
Java_app_floatphone_shell_LocalRuntime_startNode(JNIEnv* env, jobject, jstring dir, jint port, jstring key) {
    const char* root = env->GetStringUTFChars(dir, nullptr);
    const char* secret = env->GetStringUTFChars(key, nullptr);
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
