import {Construct} from 'constructs';
import {RemovalPolicy, Stack, StackProps} from "aws-cdk-lib";
import {AnyPrincipal, Effect, PolicyDocument, PolicyStatement, Role} from "aws-cdk-lib/aws-iam";
import {Repository} from "aws-cdk-lib/aws-ecr";
import {
    CloudFormationCreateUpdateStackAction,
    CodeBuildAction,
    CodeStarConnectionsSourceAction
} from "aws-cdk-lib/aws-codepipeline-actions";
import {Artifact, Pipeline, PipelineType, ProviderType} from "aws-cdk-lib/aws-codepipeline";
import {BuildEnvironmentVariableType, BuildSpec, Project} from "aws-cdk-lib/aws-codebuild";

export class AppPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const githubConnectionArn = this.node.tryGetContext('githubConnectionArn') as string;

        // const githubRepository = this.node.tryGetContext('githubRepository') as string;

        const ecrRepository = new Repository(this, 'SimpleShopUiEcrRepository', {
            repositoryName: 'simple-shop-ui-ecr-repository',
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const sourceArtifact = new Artifact('SourceArtifact');

        const outputArtifact = new Artifact('Output');

        // const shell = new ShellStep('ShellStep', {
        //     input: source,
        //     installCommands: ['cd ui', 'cd cdk', 'npm install', 'npm run cdk synth', 'cd ..'],
        //     commands: [
        //         `aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin ${ecrRepository.repositoryUri}`,
        //         `docker build -t $GIT_COMMIT_ID .`,
        //         `docker tag $GIT_COMMIT_ID ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`,
        //         `docker push ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`,
        //         `./code_deploy/setup.sh ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`
        //     ],
        //     primaryOutputDirectory: 'ui/cdk/cdk.out',
        //     env: {
        //         AWS_ACCOUNT: this.account,
        //         AWS_REGION: this.region,
        //         GIT_COMMIT_ID: source.sourceAttribute('CommitId')
        //     },
        // });
        //
        // shell.addOutputDirectory('ui/code_deploy');

        const sourceAction = new CodeStarConnectionsSourceAction(
            {
                actionName: "Source",
                connectionArn: githubConnectionArn,
                output: sourceArtifact,
                owner: "declanprice",
                repo: 'simple-shop',
                branch: 'main'
            }
        );

        const pipeline = new Pipeline(this, 'AppPipeline', {
            pipelineName: 'AppPipeline',
            pipelineType: PipelineType.V2,
            role: new Role(this, 'AppPipelineRole', {
                roleName: 'AppPipelineRole',
                assumedBy: new AnyPrincipal(),
                inlinePolicies: {
                    'sts': new PolicyDocument({
                        statements: [
                            new PolicyStatement({
                                effect: Effect.ALLOW,
                                resources: ['*'],
                                actions: ['sts:AssumeRole']
                            })
                        ]
                    }),
                }
            }),
            triggers: [{
                providerType: ProviderType.CODE_STAR_SOURCE_CONNECTION,
                gitConfiguration: {
                    sourceAction: sourceAction,
                    pullRequestFilter: [{
                        branchesIncludes: ['main'],
                        filePathsIncludes: ['ui/**']
                    }]
                }
            }]
        });

        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction]
        });

        const build = pipeline.addStage({
            stageName: 'Build',
        });

        build.addAction(new CodeBuildAction({
            actionName: "Build",
            input: sourceArtifact,
            outputs: [
                outputArtifact,
            ],
            project: new Project(this, 'AppPipelineBuildProject', {
                projectName: 'AppPipelineBuildProject',
                role: new Role(this, 'AppPipelineBuildProjectRole', {
                    roleName: 'AppPipelineBuildProjectRole',
                    assumedBy: new AnyPrincipal(),
                    inlinePolicies: {
                        'sts': new PolicyDocument({
                            statements: [
                                new PolicyStatement({
                                    effect: Effect.ALLOW,
                                    resources: ['*'],
                                    actions: ['*']
                                })
                            ]
                        }),
                    }
                }),
                buildSpec: BuildSpec.fromObject({
                    version: '0.2',
                    phases: {
                        install: {
                            commands: ['cd ecs-blue-green', 'npm install', 'npm run cdk synth']
                        },
                        build: {
                            commands: [
                                `aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin ${ecrRepository.repositoryUri}`,
                                `docker build -t $GIT_COMMIT_ID .`,
                                `docker tag $GIT_COMMIT_ID ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`,
                                `docker push ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`,
                                `./code_deploy/setup.sh ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`
                            ]
                        }
                    },
                    artifacts: {
                        files: ['ecs-blue-green'],
                    }
                })
            }),
            role: new Role(this, 'AppPipelineBuildActionRole', {
                roleName: 'AppPipelineBuildActionRole',
                assumedBy: new AnyPrincipal(),
                inlinePolicies: {
                    'sts': new PolicyDocument({
                        statements: [
                            new PolicyStatement({
                                effect: Effect.ALLOW,
                                resources: ['*'],
                                actions: ['*']
                            })
                        ]
                    }),
                }
            }),
            environmentVariables: {
                AWS_ACCOUNT: {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: this.account
                },
                AWS_REGION: {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: this.region
                },
                GIT_COMMIT_ID: {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: sourceAction.variables.commitId
                }
            }
        }));

        const devStage = pipeline.addStage({
            stageName: 'Dev',
        });

        devStage.addAction(new CloudFormationCreateUpdateStackAction({
            actionName: 'DeployAppComputeStack',
            stackName: 'AppComputeStack',
            region: this.region,
            account: this.account,
            adminPermissions: true,
            templatePath: outputArtifact.atPath('cdk.out/AppComputeStack.template.json')
        }));

        //     stage.addAction(new ManualApprovalAction({
        //         actionName: 'ManualApproval',
        //         runOrder: 3
        //     }));
        //
        //     stage.addAction(new CodeDeployEcsDeployAction({
        //             actionName: 'Deploy',
        //             role: new Role(this, 'SimpleShopUiCodeDeployRole', {
        //                 roleName: 'SimpleShopUiCodeDeployRole',
        //                 assumedBy: new AccountPrincipal(Stack.of(this).account),
        //                 inlinePolicies: {
        //                     'access': new PolicyDocument({
        //                         statements: [
        //                             new PolicyStatement({
        //                                 effect: Effect.ALLOW,
        //                                 resources: ['*'],
        //                                 actions: ['*']
        //                             })
        //                         ]
        //                     })
        //                 },
        //             }),
        //             appSpecTemplateInput: new Artifact('ShellStep_ui_code_deploy'),
        //             taskDefinitionTemplateInput: new Artifact('ShellStep_ui_code_deploy'),
        //             deploymentGroup: EcsDeploymentGroup.fromEcsDeploymentGroupAttributes(
        //                 this,
        //                 'SimpleShopUiEcsDeploymentGroup',
        //                 {
        //                     deploymentGroupName: 'SimpleShopUiEcsDeploymentGroup',
        //                     application: EcsApplication.fromEcsApplicationName(
        //                         this,
        //                         'SimpleShopUiEcsApplication',
        //                         'SimpleShopUiEcsApplication'
        //                     ),
        //                 }
        //             ),
        //             runOrder: 4,
        //         })
        //     );
        // }
    }
}

// class EcsCodeDeployStep extends Step implements ICodePipelineActionFactory {
//     constructor(readonly scope: Construct) {
//         super('CodeDeployStep')
//
//         this.discoverReferencedOutputs({
//             env: {},
//         })
//     }
//
//     public produceAction(stage: IStage): CodePipelineActionFactoryResult {
//         stage.addAction(
//
//
//         return {runOrdersConsumed: 1}
//     }
// }