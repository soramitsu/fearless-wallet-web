properties([parameters([
  booleanParam(defaultValue: true, description: '', name: 'tests'),
  booleanParam(defaultValue: false, description: '', name: 'upload_to_jenkins'),
  booleanParam(defaultValue: false, description: 'Run build with development firebase config (develop branch builds always)', name: 'should_run_dev_build'),
  booleanParam(defaultValue: false, description: 'Run build with test firebase config (master branch builds always)', name: 'should_run_test_build'),
  booleanParam(defaultValue: false, description: 'Run build with production firebase config (master branch builds always)', name: 'should_run_prod_build'),
  booleanParam(defaultValue: false, description: 'Upload builds to nexus (master and develop branches upload always)', name: 'upload_to_nexus'),
])])

pipeline {
  options {
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timestamps()
  }

  agent {
    docker {
      label 'docker-build-agent'
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

    stage('Production build') {
      when {
        anyOf {
          branch 'master'
          expression { return params.should_run_prod_build }
        }
      }
      environment {
        VUE_APP_FIREBASE_ENV = 'production'
      }
      steps {
        echo "Start production build (linux, mac)..."
        sh "yarn build:electron --publish=never --linux --mac zip"
        echo "Start production build (windows 32 and 64bit)..."
        sh "yarn build:electron --publish=never --win portable --x64 --ia32"
      }
    }

    stage('Test build') {
      when {
        anyOf {
          branch 'feature/FWW-158/ci-for-PRs'
          expression { return params.should_run_test_build }
        }
      }
      environment {
        VUE_APP_FIREBASE_ENV = 'test'
      }
      steps {
        echo "Start test build (linux, mac)..."
        sh "yarn electron:build --publish=never --linux --mac zip"
        echo "Start test build (windows 32 and 64bit)..."
        sh "yarn electron:build --publish=never --win portable --x64 --ia32"
      }
    }

    stage('Development build') {
      when {
        anyOf {
          branch 'develop'
          expression { return params.should_run_dev_build }
        }
      }
      environment {
        VUE_APP_FIREBASE_ENV = 'development'
      }
      steps {
        echo "Start development build (linux, mac, windows 64bit)..."
        sh "yarn electron:build --publish=never --linux --win portable --mac zip"
      }
    }
  }

  post {
    success {
      script {
        extensions = [ 'zip', 'AppImage' , 'exe' ]
        dist_folders = [ ];
        if (params.should_run_dev_build  || env.GIT_BRANCH == 'develop') {
          dist_folders.push('development')
        }
        if (params.should_run_test_build || env.GIT_BRANCH == 'feature/FWW-158/ci-for-PRs') {
          dist_folders.push('test')
        }
        if (params.should_run_prod_build || env.GIT_BRANCH == 'master') {
          dist_folders.push('production')
        }
        // upload to nexus
        if (env.GIT_BRANCH in ['master', 'develop'] || params.upload_to_nexus || env.TAG_NAME ) {
          artifactServers=['nexus.iroha.tech']
          withCredentials([usernamePassword(credentialsId: 'bot-fearless-rw', passwordVariable: 'NEXUS_PASS', usernameVariable: 'NEXUS_USER')]) {
            dist_folders.each { folder ->
              uploadPath = env.TAG_NAME ? "fearless/desktop/tags/${env.TAG_NAME}/${folder}" : "fearless/desktop/${env.GIT_BRANCH}/${new Date().format("yyyy-MM-dd")}-${env.GIT_COMMIT.substring(0,6)}/${folder}"
              artifactServers.each { server ->
                url = "https://${server}/repository/artifacts/${uploadPath}/"
                sh(script: "find ./dist_electron/ -maxdepth 1 -regex '.*\\.\\(${extensions.join('\\|')}\\)\$' | while read line; do curl --http1.1 -u ${NEXUS_USER}:${NEXUS_PASS} --upload-file \"\$line\" ${url}; echo ${url}\$(basename \"\$line\"); done")
                echo "Browse url: https://${server}/#browse/browse:artifacts:${uploadPath}"
              }
            }
          }
        }
        if (params.upload_to_jenkins) {
          extensions.each {
            // upload to jenkins
            archiveArtifacts artifacts: "dist_electron/*.${it}", allowEmptyArchive: true
          }
        }
      }
    }
    cleanup {
      cleanWs()
    }
  }
}