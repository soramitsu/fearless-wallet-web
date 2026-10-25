export type Link = {
  title: string
  href: string
  target?: '_blank' | '_parent' | '_self' | '_top'
}

export type NetworkInfo = {
  fullName: string
  shortName?: string
  icon: string
  description?: string[]
}
