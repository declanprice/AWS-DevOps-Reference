import {Construct} from 'constructs';
import {Stack, StackProps} from "aws-cdk-lib";
import {CodePipeline, CodePipelineSource, ShellStep} from "aws-cdk-lib/pipelines";
import {AnyPrincipal, Effect, PolicyDocument, PolicyStatement, Role} from "aws-cdk-lib/aws-iam";
import {SimpleShopUiComputeStage} from "../compute/simple-shop-ui-compute.stage";

export class SimpleShopUiPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const githubConnectionArn = this.node.tryGetContext('githubConnectionArn') as string;

        const githubRepository = this.node.tryGetContext('githubRepository') as string;

        const shell = new ShellStep('ShellStep', {
            input: CodePipelineSource.connection(githubRepository, 'main', {connectionArn: githubConnectionArn}),
            installCommands: ['cd ui', 'cd cdk', 'npm install'],
            commands: ['npm run cdk synth -- --output ../cdk.out'],
            primaryOutputDirectory: 'ui',
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
                    })
                }
            }),
        });

        pipeline.addStage(new SimpleShopUiComputeStage(this, 'SimpleShopUiComputeStage', props));
    }
}
