import type { LearningPracticeConfiguration } from '@memorilo/editor-storage'
import {
  defaultLearningPracticeConfiguration,
  validateLearningPracticeConfiguration,
} from '@memorilo/editor-storage'
import { Directory, File, Paths } from 'expo-file-system'

const settingsDirectoryName = 'memorilo-settings'
const configurationFileName = 'learning.json'

function cloneConfiguration(configuration: LearningPracticeConfiguration): LearningPracticeConfiguration {
  return {
    dailyGoal: { ...configuration.dailyGoal },
    queuePolicy: { ...configuration.queuePolicy },
  }
}

export class MobileLearningConfiguration {
  readonly #directory: Directory
  readonly #file: File
  #configuration: LearningPracticeConfiguration
  #mutation: Promise<void> = Promise.resolve()

  private constructor(directory: Directory, configuration: LearningPracticeConfiguration) {
    this.#directory = directory
    this.#file = new File(directory, configurationFileName)
    this.#configuration = configuration
  }

  static async open(): Promise<MobileLearningConfiguration> {
    const directory = new Directory(Paths.document, settingsDirectoryName)
    directory.create({ idempotent: true, intermediates: true })
    const file = new File(directory, configurationFileName)
    if (!file.exists)
      return new MobileLearningConfiguration(directory, defaultLearningPracticeConfiguration())
    const parsed: unknown = JSON.parse(await file.text())
    return new MobileLearningConfiguration(directory, validateLearningPracticeConfiguration(parsed as LearningPracticeConfiguration))
  }

  get(): LearningPracticeConfiguration {
    return cloneConfiguration(this.#configuration)
  }

  async save(configuration: LearningPracticeConfiguration): Promise<void> {
    const validated = validateLearningPracticeConfiguration(configuration)
    await this.#mutate(async () => {
      const previous = this.#configuration
      this.#configuration = validated
      try {
        await this.#persist()
      }
      catch (error) {
        this.#configuration = previous
        throw error
      }
    })
  }

  async close(): Promise<void> {
    await this.#mutation
  }

  async #mutate(operation: () => Promise<void>): Promise<void> {
    const result = this.#mutation.then(operation)
    this.#mutation = result.catch(() => undefined)
    return result
  }

  async #persist(): Promise<void> {
    const temporary = new File(this.#directory, `.learning.${crypto.randomUUID()}.tmp`)
    temporary.create()
    try {
      temporary.write(JSON.stringify(this.#configuration))
      await temporary.move(this.#file, { overwrite: true })
    }
    catch (error) {
      if (temporary.exists)
        temporary.delete()
      throw error
    }
  }
}
