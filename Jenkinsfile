@Library('jenkins-library@fix/DOPS-2097/fix-errors-params')

// Job properties
def jobParams = [
  booleanParam(defaultValue: true, description: '', name: 'tests'),
  booleanParam(defaultValue: false, description: 'Upload builds to nexus (master and develop branches upload always)', name: 'upload_to_nexus'),
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
    distFolders:                ['dist_electron', 'dist/extension'],
    preBuildCmds:               ['apt-get update && apt-get install zip && yarn install'],
    nexusFiles:                 [ '.zip', '.AppImage', '.exe', '.dmg', '.dmg.blockmap', 'latest-linux.yml','latest-mac.yml' ],
    buildEnvironment:           [OAUTH_CLIENT_ID: '123450']
)
pipeline.runPipeline()
