package com.fantasyhubapp.android;

import android.net.Uri;
import androidx.core.content.ContextCompat;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FantasyHubGoogleAuth")
public class FantasyHubGoogleAuth extends Plugin {
    private boolean working = false;

    @PluginMethod
    public void availability(PluginCall call) {
        JSObject result = new JSObject();
        result.put("configured", !getContext().getString(R.string.google_web_client_id).isEmpty());
        call.resolve(result);
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Uri origin = Uri.parse(getBridge().getWebView().getUrl());
            if (!"https".equals(origin.getScheme()) || !"fantasyhubapp.com".equals(origin.getHost())) {
                call.reject("Google sign-in is only available in Fantasy Hub.");
                return;
            }
            String clientId = getContext().getString(R.string.google_web_client_id);
            if (clientId.isEmpty()) {
                call.reject("Google sign-in is not configured for this Android build. Please use email.");
                return;
            }
            if (working) {
                call.reject("Sign-in is already in progress.");
                return;
            }
            working = true;
            try {
                GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(new GetSignInWithGoogleOption.Builder(clientId).build())
                    .build();
                CredentialManager.create(getContext()).getCredentialAsync(
                    getActivity(), request, null, ContextCompat.getMainExecutor(getContext()),
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override public void onResult(GetCredentialResponse response) {
                            working = false;
                            try {
                                String type = response.getCredential().getType();
                                if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(type)) {
                                    call.reject("Unexpected Google credential response.");
                                    return;
                                }
                                GoogleIdTokenCredential credential = GoogleIdTokenCredential.createFrom(response.getCredential().getData());
                                JSObject result = new JSObject();
                                result.put("token", credential.getIdToken());
                                // The token must be verified by Clerk, never decoded and trusted locally.
                                call.resolve(result);
                            } catch (Exception error) {
                                call.reject("Google returned an invalid credential. Please try again.");
                            }
                        }
                        @Override public void onError(GetCredentialException error) {
                            working = false;
                            if (error instanceof GetCredentialCancellationException) {
                                JSObject result = new JSObject();
                                result.put("cancelled", true);
                                call.resolve(result);
                            } else {
                                call.reject("Google sign-in could not complete. Check your Google account or use email.");
                            }
                        }
                    });
            } catch (Exception error) {
                working = false;
                call.reject("Google sign-in could not start. Please use email.");
            }
        });
    }
}
