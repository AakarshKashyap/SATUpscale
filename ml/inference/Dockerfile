FROM public.ecr.aws/lambda/python:3.11

COPY requirements.txt .
RUN pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements.txt

COPY lambda_handler.py ./
COPY upscale.py        ./
COPY edsr/model.pth    edsr/model.pth
COPY edsr/model_2x.pth edsr/model_2x.pth

CMD [" lambda_handler.handler\]
