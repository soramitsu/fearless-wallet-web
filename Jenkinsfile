@Library('jenkins-library@feature/fww-158/ci-for-PRs')

// Job properties
def jobParams = [
  booleanParam(defaultValue: true, description: '', name: 'tests'),
  booleanParam(defaultValue: true, description: 'Upload builds to nexus (master and develop branches upload always)', name: 'upload_to_nexus'),
]

def pipeline = new org.js.AppArtifactsPipeline(
    steps:                      this,
    buildCmds:                  ['yarn build:extension:zip && yarn electron:build-all'],
    jobParams:                  jobParams,
    nexusCredential:            'bot-fearless-rw',
    nexusProjectPath:           'fearless/desktop',
    sonarProjectKey:            'fearless:fearless-wallet-web',
    sonarProjectName:           'fearless-wallet-web',
    sonarCredential:            'sonar_fearless_token',
    distFolders:                ['dist_electron', 'dist'],
    //preBuildCmds:               ['yarn install --ignore-scripts && cd node_modules/canvas/ && yarn run node-pre-gyp install --fallback-to-build']
)
pipeline.runPipeline()
