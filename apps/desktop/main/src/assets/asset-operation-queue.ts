export function createAssetOperationQueue() {
  let operations = Promise.resolve()

  return <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const result = operations.then(operation)
    operations = result.then(() => undefined, () => undefined)
    return result
  }
}
