FROM php:8.3-apache
RUN a2enmod headers
COPY public/ /var/www/html/
RUN mkdir -p /var/www/data && chown www-data:www-data /var/www/data
ENV LL_DATA_DIR=/var/www/data
VOLUME /var/www/data
EXPOSE 80
