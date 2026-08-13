export const learningQueryKeys = {
  ankiCardMedia: (cardId: number) => ['learning', 'anki-review', 'media', cardId] as const,
  ankiDecksRoot: ['learning', 'anki-decks'] as const,
  ankiDecks: (connectionRevision: number) => [...learningQueryKeys.ankiDecksRoot, connectionRevision] as const,
  ankiReview: (deckId: number) => ['learning', 'anki-review', deckId] as const,
  dailyProgress: ['learning', 'daily-progress'] as const,
  notesWithCards: ['learning', 'notes-with-cards'] as const,
  optimizerOptions: ['learning', 'optimizer-options'] as const,
  optimizers: ['learning', 'optimizers'] as const,
}
