@Library('jenkins-library@fix/DOPS-2097/fix-errors-params')

def pipeline = new org.js.AppArtifactsPipeline(
    steps:                      this,
    buildCmds:                  ['yarn build:extension:zip && yarn electron:build-all'],
    nexusCredential:            'bot-fearless-rw',
    nexusProjectPath:           'fearless/desktop',
    sonarProjectKey:            'fearless:fearless-wallet-web',
    sonarProjectName:           'fearless-wallet-web',
    sonarCredential:            'sonar_fearless_token',
    distFolders:                ['dist_electron', 'dist/extension'],
    preBuildCmds:               ['apt-get update && apt-get install zip && yarn install'],
    nexusFiles:                 [ '.zip', '.AppImage', '.exe', '.dmg', '.dmg.blockmap', 'latest-linux.yml','latest-mac.yml' ],
    buildWithCred: [
      string(credentialsId: OAUTH_CLIENT_ID, variable: 'OAUTH_CLIENT_ID'),
      string(credentialsId: OAUTH_CLIENT_SECRET, variable: 'OAUTH_CLIENT_SECRET')
    ]
)
pipeline.runPipeline()
