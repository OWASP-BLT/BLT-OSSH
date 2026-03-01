# OSSH Standalone Django App
# This is a setup.py for the OSSH app if you want to install it as a separate package

from setuptools import setup, find_packages

with open("ossh/README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="django-ossh",
    version="1.0.0",
    author="OWASP BLT Team",
    author_email="blt@owasp.org",
    description="Open Source Sorting Hat - Intelligent recommendation engine for open source projects",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/OWASP/BLT",
    packages=find_packages(),
    classifiers=[
        "Framework :: Django",
        "Framework :: Django :: 3.2",
        "Framework :: Django :: 4.0",
        "Framework :: Django :: 4.1",
        "Framework :: Django :: 4.2",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
    install_requires=[
        "Django>=3.2",
        "djangorestframework>=3.12",
        "requests>=2.25",
    ],
    include_package_data=True,
    zip_safe=False,
)
