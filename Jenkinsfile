@Library('jenkins-library@feature/FWW-278/cd-firefox-ext')

def buildWithCred  = [
    [$class: 'StringBinding', credentialsId: 'OAUTH_CLIENT_ID', variable: 'OAUTH_CLIENT_ID'],
    [$class: 'StringBinding', credentialsId: 'OAUTH_CLIENT_SECRET', variable: 'OAUTH_CLIENT_SECRET'],
    [$class: 'StringBinding', credentialsId: 'OAUTH_REFRESH_TOKEN', variable: 'OAUTH_REFRESH_TOKEN'],
    [$class: 'StringBinding', credentialsId: 'OAUTH_ITEM_ID', variable: 'OAUTH_ITEM_ID'],
    [$class: 'StringBinding', credentialsId: 'EXTENSION_PUBLIC_KEY', variable: 'EXTENSION_PUBLIC_KEY'],
    [$class: 'StringBinding', credentialsId: 'MOZILLA_API_USER', variable: 'MOZILLA_API_USER'],
    [$class: 'StringBinding', credentialsId: 'MOZILLA_API_TOKEN', variable: 'MOZILLA_API_TOKEN']
  ]

def pipeline = new org.js.AppArtifactsPipeline(
    steps:                      this,
    buildCmds:                  ['yarn build:extension:firefox:zip'],
    nexusCredential:            'bot-fearless-rw',
    nexusProjectPath:           'fearless/desktop',
    sonarProjectKey:            'fearless:fearless-wallet-web',
    sonarProjectName:           'fearless-wallet-web',
    sonarCredential:            'sonar_fearless_token',
    mozillaSlug:                'fearless-wallet',
    distFolders:                ['./dist/extension/firefox'],
    preBuildCmds:               ['apt-get update && apt-get install zip xxd && yarn install'],
    nexusFiles:                 [ '.zip'],
    uploadToNexusFor:           ['master'],
    uploadToGoogleFor:          ['master'],
    uploadToFirefoxFor:         ['master'],
    disableSecretScanner:       false,
    buildWithCred:              buildWithCred
)
pipeline.runPipeline()