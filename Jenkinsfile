@Library('jenkins-library@feature/fww-158/ci-for-PRs')

// Job properties
def jobParams = [
  booleanParam(defaultValue: true, description: '', name: 'tests'),
  booleanParam(defaultValue: true, description: 'Upload builds to nexus (master and develop branches upload always)', name: 'upload_to_nexus'),
]

def pipeline = new org.js.AppArtifactsPipeline(
    steps:                      this,
    buildCmds:                  ['yarn build:extension && yarn electron:build --publish=never --linux --mac zip && yarn electron:build --publish=never --win portable --x64 --ia32'],
    jobParams:                  jobParams,
    nexusCredential:            'bot-fearless-rw',
    nexusProjectPath:           'fearless/desktop',
    sonarProjectKey:            'fearless:fearless-wallet-web',
    sonarProjectName:           'fearless-wallet-web',
    sonarCredential:            'sonar_fearless_token'
)
pipeline.runPipeline()
