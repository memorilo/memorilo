export interface EmbeddingModel {
  readonly dimensions: number
  readonly id: string
  embedDocuments: (texts: readonly string[]) => Promise<readonly Float32Array[]>
  embedQuery: (text: string) => Promise<Float32Array>
}
