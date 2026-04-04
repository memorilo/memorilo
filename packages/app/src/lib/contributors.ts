import uniqolor from 'uniqolor'
import contributorsData from '../../../../contributors.json'

interface ContributorRecord {
  avatarUrl: string
  nickname: string
  profileUrl: string
  role: string
  username: string
}

export interface ContributorDefinition extends ContributorRecord {
  accent: string
  avatarBackground: string
}

export const contributors: ContributorDefinition[] = contributorsData.map((contributor) => {
  const { color } = uniqolor(contributor.username)

  return {
    ...contributor,
    accent: color,
    avatarBackground: `${color}29`,
  }
})
