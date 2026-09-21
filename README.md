# As Minhas Despesas

Site estático (HTML/CSS/JS puro, sem instalação de pacotes) para registar despesas diárias, com:

- Grelha semanal tipo Excel — uma "página" por semana, navegável com ◀ ▶.
- Gráfico de gastos diários com linha de limite.
- Limite de dias de semana configurável: escolhes o valor e se se aplica por dia, por semana ou por mês. O fim de semana mantém-se sempre fixo em 50 €/dia. Quando o limite é semanal ou mensal, aparece uma barra de progresso com o total gasto em dias de semana nesse período.
- Alternância de visualização entre Euros e Coroas Checas (taxa de câmbio atualizada automaticamente uma vez por dia, via a API gratuita [Frankfurter](https://www.frankfurter.app)).
- Total gasto por mês (a semana mostra os meses que abrange).

Os dados ficam guardados no browser (localStorage), neste computador — persistem entre sessões, desde que abras sempre o mesmo `index.html` (não uma cópia noutra pasta) no mesmo browser. A camada de dados (`js/store.js`) já está isolada para facilitar, mais tarde, ligar a um backend/base de dados real sem alterar o resto do site.

## Como correr localmente

Basta abrir o [index.html](index.html) diretamente (duplo clique) — não precisa de servidor nem de instalação. Os scripts são JavaScript "normal" (sem `type="module"`) precisamente para funcionar assim.

Se preferires mais tarde correr via servidor local (por exemplo antes de publicar online), também funciona sem alterações:

```
python -m http.server 8000
```

e abrir [http://localhost:8000](http://localhost:8000) — mas nota que os dados guardados por essa via ficam associados a esse endereço (`http://localhost:8000`) e não aparecem se voltares a abrir o ficheiro por duplo clique (`file://`), e vice-versa, porque o browser guarda o localStorage por origem.

## Colocar online (mais tarde)

Como é um site estático, pode ser publicado tal como está em qualquer serviço de hosting estático (GitHub Pages, Netlify, Vercel, etc.) sem alterações. Nesse momento, os dados continuam só no localStorage de cada browser — se quiseres aceder às despesas em vários dispositivos, o próximo passo é substituir `js/store.js` por chamadas a uma API/base de dados real.
