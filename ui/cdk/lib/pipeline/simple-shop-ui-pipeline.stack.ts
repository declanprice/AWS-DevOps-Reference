import {Construct} from 'constructs';
import {Stack, StackProps} from "aws-cdk-lib";
import {CodePipeline, CodePipelineSource, ShellStep} from "aws-cdk-lib/pipelines";
import {AnyPrincipal, Effect, PolicyDocument, PolicyStatement, Role} from "aws-cdk-lib/aws-iam";
import {Repository} from "aws-cdk-lib/aws-ecr";
import {SimpleShopUiComputeStage} from "../compute/simple-shop-ui-compute.stage";

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
                `docker push ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`
            ],
            primaryOutputDirectory: 'ui/cdk/cdk.out',
            env: {
                AWS_ACCOUNT: this.account,
                AWS_REGION: this.region,
                GIT_COMMIT_ID: source.sourceAttribute('CommitId')
            },
        });

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

        pipeline.addStage(new SimpleShopUiComputeStage(this, 'SimpleShopUiComputeStage', props));
    }
}
