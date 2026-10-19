import { LineChart, Line, ResponsiveContainer } from 'recharts';

export function MaxWeightTrend({ data }: { data: { date: string; weight: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180} minWidth={0}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <Line
          type="monotone"
          dataKey="weight"
          stroke="#ec3013"
          strokeWidth={2.5}
          dot={{ fill: '#ec3013', r: 3, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function WeightSparkline({ data }: { data: { date: string; weight: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="weight"
          stroke="#ec3013"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
