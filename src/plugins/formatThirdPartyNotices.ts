import type LicensePlugin from 'webpack-license-plugin'

type AdditionalFilesConfigType = NonNullable<NonNullable<ConstructorParameters<typeof LicensePlugin>[0]>['additionalFiles']>
type PackageLicenseMetaType = Parameters<AdditionalFilesConfigType[string]>[0][number]

const formatThirdPartyNotices = (packages: PackageLicenseMetaType[]) =>
  packages
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, version, license, author, repository, licenseText }) => {
      const header = `${name}@${version} — ${license}${author ? ` — ${author}` : ''}${repository ? ` — ${repository}` : ''}`
      const body = (licenseText || '(license text unavailable)').trim()
      return `${header}\n${'='.repeat(header.length)}\n\n${body}`
    })
    .join('\n\n\n')

export default formatThirdPartyNotices
