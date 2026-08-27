const fs = require('fs');
const filePath = 'src/components/dashboard/views/case-detail.tsx';

fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) throw err;
  const lines = data.split('\n');
  // Find: line with '{/* Empty timeline end */'
  let insertIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('{/* Empty timeline end */')) { insertIdx = i; break; }
  }
  if (insertIdx === -1) throw new Error('Marker not found');

  // Build the replacement lines
  const insertLines = [
    '            {/* Recovery Options \u2014 Per-Intervention Probabilities */',
    '            {c.probabilityEstimates && c.probabilityEstimates.length > 0 && (',
    '              <Card className="mt-6">',
    '                <CardHeader className="pb-3">',
    '                  <CardTitle className="text-sm font-semibold">Recovery Options</CardTitle>',
    '                </CardHeader>',
    '                <CardContent>',
    '                  <p className="text-xs text-muted-foreground mb-3">',
    '                    'Computed recovery probabilities by intervention type.',
    '                    '                    Baseline represents organic recovery without intervention.',
    '                    'Model v{c.probabilityEstimates[0]?.modelVersion ?? "?"}',
    '                  </p>',
    '                  <div className="space-y-2 max-h-[420px] overflow-y-auto">',
    '                    '                      {c.probabilityEstimates',
    '                        .sort((a, b) => b.probability - a.probability)',
    '                        .map((est) => (',
    '                          <button',
    '                            key={est.id},
    '                            onClick={() => {}},',
    '                            className="cn(',
    '                              "w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer",
    '                            ')},
    '                            '                          <div className="flex items-center justify-between min-w-0 gap-2">',
    '                            <div className="flex items-center gap-2">',
    '                              <span className={cn(',
    '                                "font-semibold text-sm",
    '                                est.isBaseline',
    '                                  ? "text-muted line-through",',
    '                                  : "text-primary",
    '                              )}>{formatAction(est.action)}</span>,
    '                              <span className={cn(',
    '                                "ml-1 px-1.5 py-0.5 rounded-full px-1.5 text-[10px] font-medium text-center",
    '                                est.probability >= 0.7,',
    '                                  ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700",
    '                                  : est.probability >= 0.4,',
    '                              )},
    '                              {(est.probability * 100).toFixed(1)}%',
    '                              </span>',
    '                            </div>',
    '                            <Badge variant={',
    '                              est.probability >= 0.7 ? "outline" : "secondary",
    '                              >
                              {est.confidence >= 0.8 ? "High confidence" : "Med confidence"}',
    '                            </Badge>',
    '                          </div>
    '                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />',
    '                        </div>
 '                      </button>
    '                    ))
    '                  </CardContent>
              </Card>,
    '            );

    '            {/* Empty timeline end */',
  '          )


fs.writeFileSync(filePath, data, 'utf8');
console.log('Done');
