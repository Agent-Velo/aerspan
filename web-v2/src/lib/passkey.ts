export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  if (!base64url) return new ArrayBuffer(0);
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const uintArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    uintArray[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  if (!buffer) return '';
  const uintArray = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < uintArray.byteLength; i += 1) {
    binary += String.fromCharCode(uintArray[i]);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function prepareCredentialCreationOptions(payload: any): PublicKeyCredentialCreationOptions {
  const options = payload?.publicKey || payload?.PublicKey || payload?.response || payload?.Response;
  if (!options) {
    throw new Error('Failed to parse passkey registration options');
  }

  const publicKey: any = {
    ...options,
    challenge: base64UrlToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64UrlToBuffer(options.user?.id),
    },
  };

  if (Array.isArray(options.excludeCredentials)) {
    publicKey.excludeCredentials = options.excludeCredentials.map((item: any) => ({
      ...item,
      id: base64UrlToBuffer(item.id),
    }));
  }

  if (Array.isArray(options.attestationFormats) && options.attestationFormats.length === 0) {
    delete publicKey.attestationFormats;
  }

  return publicKey as PublicKeyCredentialCreationOptions;
}

export function prepareCredentialRequestOptions(payload: any): PublicKeyCredentialRequestOptions {
  const options = payload?.publicKey || payload?.PublicKey || payload?.response || payload?.Response;
  if (!options) {
    throw new Error('Failed to parse passkey login options');
  }

  const publicKey: any = {
    ...options,
    challenge: base64UrlToBuffer(options.challenge),
  };

  if (Array.isArray(options.allowCredentials)) {
    publicKey.allowCredentials = options.allowCredentials.map((item: any) => ({
      ...item,
      id: base64UrlToBuffer(item.id),
    }));
  }

  return publicKey as PublicKeyCredentialRequestOptions;
}

export function buildRegistrationResult(credential: PublicKeyCredential): any {
  if (!credential) return null;
  const response = credential.response as AuthenticatorAttestationResponse;
  const transports =
    typeof (response as any).getTransports === 'function' ? (response as any).getTransports() : undefined;

  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: (credential as any).authenticatorAttachment,
    response: {
      attestationObject: bufferToBase64Url(response.attestationObject),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      transports,
    },
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
  };
}

export function buildAssertionResult(assertion: PublicKeyCredential): any {
  if (!assertion) return null;
  const response = assertion.response as AuthenticatorAssertionResponse;

  return {
    id: assertion.id,
    rawId: bufferToBase64Url(assertion.rawId),
    type: assertion.type,
    authenticatorAttachment: (assertion as any).authenticatorAttachment,
    response: {
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
    },
    clientExtensionResults: assertion.getClientExtensionResults?.() ?? {},
  };
}

export async function isPasskeySupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !(window as any).PublicKeyCredential) {
    return false;
  }
  const pk = window.PublicKeyCredential as any;
  if (typeof pk.isConditionalMediationAvailable === 'function') {
    try {
      const available = await pk.isConditionalMediationAvailable();
      if (available) return true;
    } catch {
      // ignore
    }
  }
  if (typeof pk.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    try {
      return await pk.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }
  return true;
}

