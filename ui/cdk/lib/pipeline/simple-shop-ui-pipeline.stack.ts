import {Construct} from 'constructs';
import {Stack, StackProps} from "aws-cdk-lib";
import {
    CodePipeline, CodePipelineActionFactoryResult,
    CodePipelineSource,
    ICodePipelineActionFactory, ManualApprovalStep,
    ShellStep,
    Step
} from "aws-cdk-lib/pipelines";
import {AccountPrincipal, AnyPrincipal, Effect, PolicyDocument, PolicyStatement, Role} from "aws-cdk-lib/aws-iam";
import {Repository} from "aws-cdk-lib/aws-ecr";
import {SimpleShopUiComputeStage} from "../compute/simple-shop-ui-compute.stage";
import {CodeDeployEcsDeployAction, ManualApprovalAction} from "aws-cdk-lib/aws-codepipeline-actions";
import {Artifact, IStage} from "aws-cdk-lib/aws-codepipeline";
import {EcsApplication, EcsDeploymentGroup} from "aws-cdk-lib/aws-codedeploy";

export class SimpleShopUiPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const githubConnectionArn = this.node.tryGetContext('githubConnectionArn') as string;

        const githubRepository = this.node.tryGetContext('githubRepository') as string;

        const ecrRepository = new Repository(this, 'SimpleShopUiEcrRepository', {
            repositoryName: 'simple-shop-ui-ecr-repository',
        });

        const source = CodePipelineSource.connection(githubRepository, 'main', {connectionArn: githubConnectionArn});

        const shell = new ShellStep('ShellStep', {
            input: source,
            installCommands: ['cd ui', 'cd cdk', 'npm install', 'npm run cdk synth', 'cd ..'],
            commands: [
                `aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin ${ecrRepository.repositoryUri}`,
                `docker build -t $GIT_COMMIT_ID .`,
                `docker tag $GIT_COMMIT_ID ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`,
                `docker push ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`,
                `./code_deploy/setup.sh ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`
            ],
            primaryOutputDirectory: 'ui/cdk/cdk.out',
            env: {
                AWS_ACCOUNT: this.account,
                AWS_REGION: this.region,
                GIT_COMMIT_ID: source.sourceAttribute('CommitId')
            },
        });

        shell.addOutputDirectory('ui/code_deploy');

        const pipeline = new CodePipeline(this, 'CodePipeline', {
            synth: shell,
            synthCodeBuildDefaults: {
                rolePolicy: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        resources: ['*'],
                        actions: ['ecr:*']
                    })
                ]
            },
            selfMutation: false,
            role: new Role(this, 'SimpleShopUiPipelineRole', {
                roleName: 'SimpleShopUiPipelineRole',
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
        });

        const stage = pipeline.addStage(new SimpleShopUiComputeStage(this, 'SimpleShopUiComputeStage', props));

        stage.addPost(new ManualApprovalStep('SimpleShopUiApproveDeployment'));

        stage.addPost(new EcsCodeDeployStep(this));
    }
}

class EcsCodeDeployStep extends Step implements ICodePipelineActionFactory {
    constructor(readonly scope: Construct) {
        super('CodeDeployStep')

        this.discoverReferencedOutputs({
            env: {},
        })
    }

    public produceAction(stage: IStage): CodePipelineActionFactoryResult {
        stage.addAction(
            new CodeDeployEcsDeployAction({
                actionName: 'Deploy',
                role: new Role(this.scope, 'SimpleShopUiCodeDeployRole', {
                    roleName: 'SimpleShopUiCodeDeployRole',
                    assumedBy: new AccountPrincipal(Stack.of(this.scope).account),
                    inlinePolicies: {
                        'access': new PolicyDocument({
                            statements: [
                                new PolicyStatement({
                                    effect: Effect.ALLOW,
                                    resources: ['*'],
                                    actions: ['*']
                                })
                            ]
                        })
                    },
                }),
                appSpecTemplateInput: new Artifact('ShellStep_ui_code_deploy'),
                taskDefinitionTemplateInput: new Artifact('ShellStep_ui_code_deploy'),
                deploymentGroup: EcsDeploymentGroup.fromEcsDeploymentGroupAttributes(
                    this.scope,
                    'SimpleShopUiEcsDeploymentGroup',
                    {
                        deploymentGroupName: 'SimpleShopUiEcsDeploymentGroup',
                        application: EcsApplication.fromEcsApplicationName(
                            this.scope,
                            'SimpleShopUiEcsApplication',
                            'SimpleShopUiEcsApplication'
                        ),
                    }
                ),
                runOrder: 3,
            })
        )

        return {runOrdersConsumed: 1}
    }
}
