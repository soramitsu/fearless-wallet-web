@Library('jenkins-library')

def buildWithCred  = [
    [$class: 'UsernamePasswordMultiBinding', credentialsId: 'OAUTH_CLIENT_UPLOAD', usernameVariable: 'OAUTH_CLIENT_ID_UPLOAD', passwordVariable: 'OAUTH_CLIENT_SECRET_UPLOAD'],
    [$class: 'UsernamePasswordMultiBinding', credentialsId: 'OAUTH_CLIENT_WEB', usernameVariable: 'OAUTH_CLIENT_ID', passwordVariable: 'OAUTH_CLIENT_SECRET'],
    [$class: 'StringBinding', credentialsId: 'OAUTH_REFRESH_TOKEN', variable: 'OAUTH_REFRESH_TOKEN'],
    [$class: 'StringBinding', credentialsId: 'OAUTH_ITEM_ID', variable: 'OAUTH_ITEM_ID'],
    [$class: 'StringBinding', credentialsId: 'EXTENSION_PUBLIC_KEY', variable: 'EXTENSION_PUBLIC_KEY'],
    [$class: 'StringBinding', credentialsId: 'MOZILLA_API_USER', variable: 'MOZILLA_API_USER'],
    [$class: 'StringBinding', credentialsId: 'MOZILLA_API_TOKEN', variable: 'MOZILLA_API_TOKEN'],
    [$class: 'StringBinding', credentialsId: 'sorabot-github-token', variable: 'GH_TOKEN'],
    [$class: 'StringBinding', credentialsId: 'RAMP_TEST_API_KEY', variable: 'RAMP_TEST_API_KEY'],
    [$class: 'StringBinding', credentialsId: 'RAMP_PROD_API_KEY', variable: 'RAMP_PROD_API_KEY'],
    [$class: 'StringBinding', credentialsId: 'MOONPAY_TEST_API_KEY', variable: 'MOONPAY_TEST_API_KEY'],
    [$class: 'StringBinding', credentialsId: 'MOONPAY_PROD_API_KEY', variable: 'MOONPAY_PROD_API_KEY']
]

def pipeline = new org.js.AppArtifactsPipeline(
    steps:                      this,
    secretScannerExclusion:     '/src/extension/background/extension-base/src/api/evm/history.ts',
    buildCmds:                  ['yarn build:extension:all'],
    nexusCredential:            'bot-fearless-rw',
    nexusProjectPath:           'fearless/extension',
    nexusNotification:           true,
    nexusChatID:                "-1001934877683",
    sonarProjectKey:            'fearless:fearless-wallet-web',
    sonarProjectName:           'fearless-wallet-web',
    sonarCredential:            'sonar_fearless_token',
    mozillaSlug:                'fearless-wallet',
    mozillaChannel:             'listed',
    distFolders:                ['./dist/extension/firefox','./dist/extension/chrome'],
    preBuildCmds:               ['apt-get update && apt-get install zip -y && yarn set version 3.4.1 && yarn install'],
    nexusFiles:                 [ '.zip'],
    chromeExtFile:              'fearless-wallet-extension-chrome.zip',
    mozillaExtFile:             'fearless-wallet-extension-firefox.zip',
    uploadToNexusFor:           ['master','develop'],
    uploadToGoogleFor:          ['master'],
    uploadToFirefoxFor:         ['master'],
    buildWithCred:              buildWithCred
)
pipeline.runPipeline()