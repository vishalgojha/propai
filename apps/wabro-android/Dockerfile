FROM joseluisq/static-web-server:2
ENV SERVER_PORT=8000
ENV CACHE_CONTROL="public, max-age=3600, s-maxage=86400"
ENV SERVER_CONFIG_FILE=/etc/sws.toml
EXPOSE 8000
COPY landing/ /public/
COPY web/ /public/app/
COPY sws.toml /etc/sws.toml
COPY CNAME /public/CNAME
COPY privacy.html /public/privacy.html
COPY terms.html /public/terms.html
COPY refund.html /public/refund.html
COPY contact.html /public/contact.html
COPY dashboard.html /public/dashboard.html
