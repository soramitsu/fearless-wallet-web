@Library('jenkins-library') _
Boolean disableSecretScanner  = false
String secretScannerExclusion = ''
String registry               = 'docker.soramitsu.co.jp'
String agentLabel             = 'docker-build-agent'  
String agentImage             = 'node:14-ubuntu'
String dockerBuildToolsUserId = 'bot-build-tools-ro'
String sonarCredential        = 'sonar_fearless_token'
String sonarHost              = 'sonar.soramitsu.co.jp'
String sonarProjectKey        = 'fearless:fearless-wallet-web'
String sonarProjectName       = 'fearless-wallet-web'
String nexusCredentials       = 'bot-fearless-rw'
ArrayList artifactServers     = ["nexus.iroha.tech"]
ArrayList uploadToNexusFor    = ['master', 'develop']

properties([parameters([
  booleanParam(defaultValue: true, description: '', name: 'tests'),
  booleanParam(defaultValue: false, description: 'Upload builds to nexus (master and develop branches upload always)', name: 'upload_to_nexus'),
])])

pipeline {
  options {
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timestamps()
    disableConcurrentBuilds()
  }
  agent none
  stages {
    stage ('Check code'){  
        agent {
            docker {
            label "${agentLabel}"
            image "${registry}/build-tools/${agentImage}"
            args  '-v /var/run/docker.sock:/var/run/docker.sock -v /tmp:/tmp'
            registryCredentialsId "${dockerBuildToolsUserId}"
            registryUrl "https://${registry}"      
            }
        }

        stages {
            stage('Secret scanner') {
                steps {
                    script {
                        gitNotify('main-CI', 'PENDING', 'This commit is being built')
                        docker.withRegistry('https://' + registry, dockerBuildToolsUserId) {
                            secretScanner(disableSecretScanner, secretScannerExclusion)
                        }
                    }
                }
            }
            stage("Sonar"){
                environment { SONAR_TOKEN = credentials("${sonarCredential}") }
                steps {
                    script {
                            sonar(sonarHost, env.SONAR_TOKEN, env.BRANCH_NAME, sonarProjectKey, sonarProjectName)
                    }
                    
                }    
            }         
        }    
    }
    stage ('Test and build'){
        agent {
            docker {
            label "${agentLabel}"
            image 'electronuserland/builder:wine'
            args  '-v /var/cache/yarn:/usr/local/share/.cache/yarn -v /var/cache/electron:/root/.cache/electron -v /var/cache/electron-builder:/root/.cache/electron-builder'
            }
        }
        stages {
            stage ('Init') {
                steps {
                    sh "yarn install"
                }
            }

            stage ('Test') {
                when {
                    expression { return params.tests }
                }
                steps {
                    sh "yarn test:all"
                }
            }
            stage('Build') {
                steps {
                    echo "Start build extension..."
                    sh "yarn build:extension"
                    echo "Start build (linux, mac)..."
                    sh "yarn electron:build --publish=never --linux --mac zip"
                    echo "Start build (windows 32 and 64bit)..."
                    sh "yarn electron:build --publish=never --win portable --x64 --ia32"
                }
            }
            stage ('Push artifacts') {
                steps {
                    script {
                        extensions = [ 'zip', 'AppImage' , 'exe' ]
                        // upload to nexus
                        if (env.GIT_BRANCH in uploadToNexusFor || params.upload_to_nexus || env.TAG_NAME ) {
                            withCredentials([usernamePassword(credentialsId: nexusCredentials, passwordVariable: 'NEXUS_PASS', usernameVariable: 'NEXUS_USER')]) {
                                uploadPath = env.TAG_NAME ? "fearless/desktop/tags/${env.TAG_NAME}" : "fearless/desktop/${env.GIT_BRANCH}/${new Date().format("yyyy-MM-dd")}-${env.GIT_COMMIT.substring(0,6)}"
                                artifactServers.each { server ->
                                    url = "https://${server}/repository/artifacts/${uploadPath}/dist_electron/"
                                    sh(script: "find ./dist_electron/ -maxdepth 1 -regex '.*\\.\\(${extensions.join('\\|')}\\)\$' | while read line; do curl --http1.1 -u ${NEXUS_USER}:${NEXUS_PASS} --upload-file \"\$line\" ${url}; echo ${url}\$(basename \"\$line\"); done")
                                    echo "Browse url: https://${server}/#browse/browse:artifacts:${uploadPath}"
                                    url = "https://${server}/repository/artifacts/${uploadPath}/dist_extension/"
                                    sh(script: "find ./dist/extension -type f | while read line; do curl --http1.1 -u ${NEXUS_USER}:${NEXUS_PASS} --upload-file \"\$line\" ${url}; echo ${url}\$(basename \"\$line\"); done")
                                    echo "Browse url: https://${server}/#browse/browse:artifacts:${uploadPath}"
                                }
                            }
                        }
                    }
                }
            }    
        }
        post {
            always {
                script{
                    gitNotify('main-CI', currentBuild.result, currentBuild.result)
                }
            }
            cleanup {
                cleanWs()
            }
        }
    }
  }
}
