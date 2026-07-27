pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
    }

    environment {
        HARBOR_HOST = 'harbor.nutriease.com'
        IMAGE_REPO = 'harbor.nutriease.com/ai-agent/multi-intent'

        GITOPS_REPO = 'git@codeup.aliyun.com:647947d6d2963c5649be063a/ops/k8s-gitops.git'
        GITOPS_BRANCH = 'master'
        GITOPS_FILE = 'apps/multi-intent/kustomization.yaml'
    }

    stages {
        stage('检出应用代码') {
            steps {
                checkout scm
                script {
                    env.IMAGE_TAG = sh(
                        script: 'git rev-parse --short=12 HEAD',
                        returnStdout: true
                    ).trim()
                }
            }
        }

        stage('构建镜像') {
            steps {
                sh '''
                    docker build \
                      --pull \
                      --label org.opencontainers.image.revision="${GIT_COMMIT}" \
                      -t "${IMAGE_REPO}:${IMAGE_TAG}" \
                      .
                '''
            }
        }

        stage('推送 Harbor') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'harbor-credentials',
                        usernameVariable: 'HARBOR_USER',
                        passwordVariable: 'HARBOR_PASSWORD'
                    )
                ]) {
                    sh '''
                        set +x
                        printf '%s' "$HARBOR_PASSWORD" |
                          docker login "$HARBOR_HOST" \
                            --username "$HARBOR_USER" \
                            --password-stdin

                        docker push "${IMAGE_REPO}:${IMAGE_TAG}"
                        docker logout "$HARBOR_HOST"
                    '''
                }
            }
        }

        stage('更新 GitOps 仓库') {
            steps {
                sshagent(credentials: ['gitops-ssh-key']) {
                    sh '''
                        rm -rf k8s-gitops

                        git clone \
                          --branch "${GITOPS_BRANCH}" \
                          "${GITOPS_REPO}" \
                          k8s-gitops

                        cd k8s-gitops

                        sed -i \
                          "/name: harbor.nutriease.com\\/ai-agent\\/multi-intent/{n;s/newTag:.*/newTag: ${IMAGE_TAG}/;}" \
                          "${GITOPS_FILE}"

                        grep -A1 \
                          "name: harbor.nutriease.com/ai-agent/multi-intent" \
                          "${GITOPS_FILE}"

                        git config user.name "jenkins-ci"
                        git config user.email "jenkins-ci@nutriease.com"

                        git add "${GITOPS_FILE}"

                        if git diff --cached --quiet; then
                            echo "GitOps 镜像版本没有变化"
                        else
                            git commit -m "deploy(multi-intent): ${IMAGE_TAG}"
                            git push origin "${GITOPS_BRANCH}"
                        fi
                    '''
                }
            }
        }
    }

    post {
        always {
            sh '''
                if [ -n "${IMAGE_TAG:-}" ]; then
                    docker image rm "${IMAGE_REPO}:${IMAGE_TAG}" || true
                fi
            '''
            cleanWs(
                deleteDirs: true,
                disableDeferredWipeout: true
            )
        }

        success {
            echo "镜像已推送：${IMAGE_REPO}:${IMAGE_TAG}"
            echo "GitOps 仓库已更新，后续由 Argo CD 部署"
        }

        failure {
            echo '流水线失败，GitOps 仓库不会更新到未成功推送的镜像'
        }
    }
}