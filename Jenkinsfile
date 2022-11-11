@Library('jenkins-library')


def pipeline = new org.js.AppArtifactsPipeline(
    steps:                      this,
    buildCmds:                  ['yarn build:extension && yarn electron:build --publish=never --linux --mac zip && yarn electron:build --publish=never --win portable --x64 --ia32'],
    nexusCredential:            'bot-fearless-rw',
    nexusProjectPath:           'fearless/desktop',
    sonarProjectKey:            'fearless:fearless-wallet-web',
    sonarProjectName:           'fearless-wallet-web',
    sonarCredential:            'sonar_fearless_token'
)
pipeline.runPipeline()
