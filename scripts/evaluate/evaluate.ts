import { runEvaluation } from "../../src/services/evaluation/evaluator"

function parseArgs(args: string[]) {
  const parsed: Record<string, string | number | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      const key = args[i].slice(2)
      const val = args[i + 1]
      if (val === 'true') parsed[key] = true
      else if (val === 'false') parsed[key] = false
      else if (!isNaN(Number(val))) parsed[key] = Number(val)
      else parsed[key] = val
      i++
    }
  }
  return parsed
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const seed = (args.seed as number) ?? 42
  const casesCount = (args.cases as number) ?? 100

  console.log(`=== Running Evaluation Harness ===`)
  console.log(`Seed: ${seed}, Cases: ${casesCount}`)
  console.log(`Working... (this uses synthetic probabilities to determine deterministic outcomes)`)

  const run = await runEvaluation({ seed, sampleSize: casesCount })

  const strategies = Array.from(new Set(run.results.flatMap(r => r.strategyResults.map(s => s.strategyName))))
  
  const metrics: Record<string, any> = {}

  for (const strategy of strategies) {
    const sResults = run.results.flatMap(r => r.strategyResults).filter(s => s.strategyName === strategy)
    
    const actionsTaken = sResults.filter(s => s.action !== "no_action").length
    
    let deterministicRecovered = 0;
    let heuristicRecovered = 0;

    for (const s of sResults) {
      if (s.simulatedRecoveredAmount > 0) {
        // Deterministic actions vs heuristic fallback
        if (["payment_link", "retry_payment"].includes(s.action)) {
          deterministicRecovered += s.simulatedRecoveredAmount;
        } else {
          heuristicRecovered += s.simulatedRecoveredAmount;
        }
      }
    }

    const recoveredAmount = deterministicRecovered + heuristicRecovered;
    const interventionCost = sResults.reduce((acc, curr) => acc + (curr.interventionCost ?? 0), 0)
    const incentiveCost = sResults.reduce((acc, curr) => acc + (curr.incentiveCost ?? 0), 0)
    const totalCost = interventionCost + incentiveCost
    const netValue = deterministicRecovered - totalCost // We only base net value on deterministic
    const unnecessaryActions = sResults.filter(s => s.isUnnecessary).length
    const noActionCount = sResults.filter(s => s.action === "no_action").length

    metrics[strategy] = {
      Cases: sResults.length,
      Actions: actionsTaken,
      "No Action": noActionCount,
      "Recovered ₹ (Confirmed)": (deterministicRecovered / 100).toFixed(2),
      "Recovered ₹ (Unconfirmed)": (heuristicRecovered / 100).toFixed(2),
      "Costs ₹": (totalCost / 100).toFixed(2),
      "Net Value ₹ (Confirmed)": (netValue / 100).toFixed(2),
      "Recovery Rate": ((sResults.filter(s => s.simulatedRecoveredAmount > 0).length / sResults.length) * 100).toFixed(1) + "%",
      "Unnecessary Actions": unnecessaryActions
    }
  }

  // Print results
  console.log(`\n=== RESULTS ===\n`)
  console.table(metrics)

  const aiNet = parseFloat(metrics["AI_ECONOMIC_GATE"]["Net Value ₹ (Confirmed)"])
  const naiveNet = parseFloat(metrics["NAIVE"]["Net Value ₹ (Confirmed)"])
  const aiActions = metrics["AI_ECONOMIC_GATE"]["Actions"]
  const naiveActions = metrics["NAIVE"]["Actions"]

  console.log(`\n=== KEY FINDINGS ===`)
  console.log(`Actions avoided by AI Economic Gate: ${naiveActions - aiActions}`)
  if (aiNet > naiveNet) {
    console.log(`WINNER BY NET VALUE: AI_ECONOMIC_GATE (+₹${(aiNet - naiveNet).toFixed(2)} over NAIVE)`)
  } else {
    console.log(`WINNER BY NET VALUE: NAIVE (+₹${(naiveNet - aiNet).toFixed(2)} over AI_ECONOMIC_GATE)`)
  }
  
  console.log(`\nNote: The evaluation harness measures simulated strategy performance on controlled datasets.`)
  console.log(`It does not by itself establish causal real-world incremental revenue.`)
}

main().catch(console.error).finally(() => process.exit(0))
