export type SecretReference = {
  provider: string;
  reference: string;
};

export type SecretReferenceResolver = {
  resolve(reference: SecretReference): Promise<{
    apiKey: string;
    apiSecret: string;
  }>;
};

export function validateSecretReference(reference: SecretReference) {
  if (!reference.provider.trim() || !reference.reference.trim()) {
    throw new Error("Secret-manager reference is required");
  }
}
