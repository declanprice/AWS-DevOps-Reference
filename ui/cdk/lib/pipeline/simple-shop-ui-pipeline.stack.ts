import {Construct} from 'constructs';
import {Stack, StackProps} from "aws-cdk-lib";
import {CodePipeline, CodePipelineSource, ShellStep} from "aws-cdk-lib/pipelines";
import {AnyPrincipal, Effect, PolicyDocument, PolicyStatement, Role} from "aws-cdk-lib/aws-iam";
import {SimpleShopUiComputeStage} from "../compute/simple-shop-ui-compute.stage";
import {Repository} from "aws-cdk-lib/aws-ecr";

export class SimpleShopUiPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const githubConnectionArn = this.node.tryGetContext('githubConnectionArn') as string;

        const githubRepository = this.node.tryGetContext('githubRepository') as string;

        const ecrRepository = new Repository(this, 'SimpleShopUiEcrRepository', {
            repositoryName: 'simple-shop-ui-ecr-repository',
        });

        const shell = new ShellStep('ShellStep', {
            input: CodePipelineSource.connection(githubRepository, 'main', {connectionArn: githubConnectionArn}),
            installCommands: ['cd ui', 'cd cdk', 'npm install'],
            commands: [
                `aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin ${ecrRepository.repositoryUri}`,
                'npm run cdk synth',
                'cd ..',
                'docker build -t $GIT_COMMIT_ID .',
                `docker tag $GIT_COMMIT_ID ${ecrRepository.repositoryUri}`,
                `docker push ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`
            ],
            primaryOutputDirectory: 'ui/cdk/cdk.out',
            env: {
                AWS_ACCOUNT: this.account,
                AWS_REGION: this.region,
            },
        });

        const pipeline = new CodePipeline(this, 'CodePipeline', {
            synth: shell,
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
                    'ecr': new PolicyDocument({
                        statements: [
                            new PolicyStatement({
                                effect: Effect.ALLOW,
                                resources: ['*'],
                                actions: ['ecr:*']
                            })
                        ]
                    })
                }
            }),
        });


        pipeline.addStage(new SimpleShopUiComputeStage(this, 'SimpleShopUiComputeStage', props));
    }
}
