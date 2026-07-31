# HTML Fixture

## HTML comment

Before the comment.
<!-- a folded comment
   spanning multiple lines -->
After the comment.

## Raw HTML (block)

<div class="raw-block">
  <span>inline content</span>
</div>

## Raw HTML inline

Text with <span class="inline">an inline element</span> inside.

## Script must be inert

<script>
  window.__shouldNeverRun__ = true;
</script>

## Event handlers must be inert

<img src="x" onerror="window.__never__ = 1">

<a href="#" onclick="return false">clickable</a>

## Unsafe URLs in HTML attributes

<a href="javascript:void(0)">javascript link</a>

<iframe src="https://example.com/embed"></iframe>

## HTML entities and CDATA

&copy; &amp; &lt;tag&gt; &#169;

<![CDATA[ raw cdata content ]]>

## Mixed HTML and Markdown

<div>

# Heading inside an HTML block

- list inside HTML block

</div>

Paragraph after with *markdown*.
