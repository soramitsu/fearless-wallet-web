@Library('jenkins-library@feature/FWW-278/cd-firefox-ext')

def buildWithCred  = [
    [$class: 'StringBinding', credentialsId: 'OAUTH_CLIENT_ID', variable: 'OAUTH_CLIENT_ID'],
    [$class: 'StringBinding', credentialsId: 'OAUTH_CLIENT_SECRET', variable: 'OAUTH_CLIENT_SECRET'],
    [$class: 'StringBinding', credentialsId: 'OAUTH_REFRESH_TOKEN', variable: 'OAUTH_REFRESH_TOKEN'],
    [$class: 'StringBinding', credentialsId: 'OAUTH_ITEM_ID', variable: 'OAUTH_ITEM_ID'],
    [$class: 'StringBinding', credentialsId: 'EXTENSION_PUBLIC_KEY', variable: 'EXTENSION_PUBLIC_KEY'],
    [$class: 'StringBinding', credentialsId: 'MOZILLA_API_USER', variable: 'MOZILLA_API_USER'],
    [$class: 'StringBinding', credentialsId: 'MOZILLA_API_TOKEN', variable: 'MOZILLA_API_TOKEN'],
    [$class: 'StringBinding', credentialsId: 'sorabot-github-token', variable: 'GH_TOKEN']
  ]

def pipeline = new org.js.AppArtifactsPipeline(
    steps:                      this,
    buildCmds:                  ['yarn build:extension:all'],
    nexusCredential:            'bot-fearless-rw',
    nexusProjectPath:           'fearless/extension',
    sonarProjectKey:            'fearless:fearless-wallet-web',
    sonarProjectName:           'fearless-wallet-web',
    sonarCredential:            'sonar_fearless_token',
    mozillaSlug:                'fearless-wallet',
    mozillaGUIDext:             '{6a9332b9-e864-4d0a-a591-140fe75a29ba}',
    mozillaChannel:             'unlisted',
    distFolders:                ['./dist/extension/firefox','./dist/extension/chrome'],
    preBuildCmds:               ['apt-get update && apt-get install zip xxd jq -y && yarn install'],
    nexusFiles:                 [ '.zip'],
    chromeExtFile:              'fearless-wallet-extension-chrome.zip',
    mozillaExtFile:             'fearless-wallet-extension-firefox.zip',
    uploadToNexusFor:           ['master'],
    uploadToGoogleFor:          ['master'],
    uploadToFirefoxFor:         ['master'],
    disableSecretScanner:       false,
    buildWithCred:              buildWithCred
)
pipeline.runPipeline()