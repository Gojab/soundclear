package com.zhafx.soundclear;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.tasks.Task;

/**
 * Capacitor native plugin for Google Sign-In on Android using Google Play Services Auth.
 * Obtains a Google ID token natively and hands it to Firebase JS Auth (signInWithCredential)
 * so WebView avoids disallowed_useragent and popup restrictions while keeping Firestore sync intact.
 */
@CapacitorPlugin(name = "SoundClearGoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    private GoogleSignInClient buildClient(String webClientId) {
        GoogleSignInOptions.Builder builder = new GoogleSignInOptions.Builder(
            GoogleSignInOptions.DEFAULT_SIGN_IN
        )
            .requestEmail()
            .requestProfile();

        if (webClientId != null && !webClientId.trim().isEmpty()) {
            builder.requestIdToken(webClientId.trim());
        }

        return GoogleSignIn.getClient(getActivity(), builder.build());
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity Android tidak tersedia.");
            return;
        }

        String webClientId = call.getString("webClientId", "");
        if (webClientId == null || webClientId.trim().isEmpty()) {
            call.reject("Web Client ID OAuth tidak tersedia untuk login Google.");
            return;
        }

        GoogleSignInClient client = buildClient(webClientId);
        // Sign out cached GoogleSignInAccount first so user can pick an account cleanly
        client
            .signOut()
            .addOnCompleteListener(activity, ignored -> {
                Intent signInIntent = client.getSignInIntent();
                startActivityForResult(call, signInIntent, "handleSignInResult");
            });
    }

    @ActivityCallback
    private void handleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        Intent data = result != null ? result.getData() : null;
        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);

        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            if (account == null) {
                call.reject("Akun Google tidak ditemukan.", "NO_ACCOUNT");
                return;
            }

            String idToken = account.getIdToken();
            if (idToken == null || idToken.trim().isEmpty()) {
                call.reject(
                    "Token ID Google kosong. Pastikan Web Client ID & SHA-1 Android sudah terdaftar di Firebase Console.",
                    "MISSING_ID_TOKEN"
                );
                return;
            }

            JSObject res = new JSObject();
            res.put("idToken", idToken);
            res.put("email", account.getEmail());
            res.put("displayName", account.getDisplayName());
            res.put("photoUrl", account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : null);
            call.resolve(res);
        } catch (ApiException e) {
            int code = e.getStatusCode();
            if (
                code == GoogleSignInStatusCodes.SIGN_IN_CANCELLED ||
                code == CommonStatusCodes.CANCELED ||
                (result != null && result.getResultCode() == Activity.RESULT_CANCELED && code == CommonStatusCodes.INTERNAL_ERROR)
            ) {
                call.reject("popup-closed-by-user", "SIGN_IN_CANCELLED");
                return;
            }
            if (code == CommonStatusCodes.DEVELOPER_ERROR) {
                call.reject(
                    "developer-error: SHA-1 atau package com.zhafx.soundclear belum terdaftar di Firebase Console.",
                    "DEVELOPER_ERROR"
                );
                return;
            }
            if (code == CommonStatusCodes.NETWORK_ERROR) {
                call.reject(
                    "network-error: Gagal terhubung ke Google Play Services. Periksa koneksi internet.",
                    "NETWORK_ERROR"
                );
                return;
            }
            call.reject("Login Google Android gagal (kode " + code + "): " + e.getMessage(), String.valueOf(code));
        }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        GoogleSignInClient client = buildClient(null);
        client.signOut().addOnCompleteListener(activity, ignored -> call.resolve());
    }
}
