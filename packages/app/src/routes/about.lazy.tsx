import { createLazyFileRoute } from '@tanstack/react-router'
import { AboutPage } from '~/components/about/about-page'

export const Route = createLazyFileRoute('/about')({
  component: AboutPage,
})
